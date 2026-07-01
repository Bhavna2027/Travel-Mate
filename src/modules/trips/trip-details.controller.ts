import { Request, Response } from 'express';
import { prisma } from '../../db/client';
import { logAction } from '../../services/audit.service';

interface AuthenticatedRequest extends Request {
  user?: {
    user_id: string;
    email: string;
    phone: string;
  };
}

// ============================================================
// ITINERARY ENDPOINTS (with Optimistic Locking version checks)
// ============================================================

export async function getItinerary(req: AuthenticatedRequest, res: Response) {
  try {
    const { group_id } = req.params;

    const itinerary = await prisma.itineraries.findUnique({
      where: { group_id },
      include: {
        itinerary_items: {
          orderBy: [{ day_number: 'asc' }, { sort_order: 'asc' }]
        }
      }
    });

    if (!itinerary) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Itinerary not found for this group.' });
      return;
    }

    res.status(200).json(itinerary);
  } catch (err) {
    console.error('Get itinerary error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

export async function updateItineraryItems(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Auth required.' });
      return;
    }

    const { itinerary_id } = req.params;
    const { items, version } = req.body; // version is required for optimistic locking

    if (version === undefined || !Array.isArray(items)) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Version and items array are required.' });
      return;
    }

    // Perform inside transaction to check version and apply edits atomically
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.itineraries.findUnique({
        where: { itinerary_id }
      });

      if (!current) {
        throw new Error('ITINERARY_NOT_FOUND');
      }

      // Optimistic Locking Check: FR-26
      if (current.version !== parseInt(version)) {
        throw new Error('VERSION_CONFLICT');
      }

      // Delete old items
      await tx.itinerary_items.deleteMany({
        where: { itinerary_id }
      });

      // Write new items
      for (const item of items) {
        await tx.itinerary_items.create({
          data: {
            itinerary_id,
            day_number: parseInt(item.day_number),
            title: item.title,
            description: item.description || null,
            location: item.location || null,
            start_time: item.start_time ? item.start_time : null,
            sort_order: item.sort_order ? parseInt(item.sort_order) : 0,
            added_by: userId
          }
        });
      }

      // Increment version
      const updated = await tx.itineraries.update({
        where: { itinerary_id },
        data: {
          version: { increment: 1 },
          last_edited_by: userId,
          updated_at: new Date()
        },
        include: {
          itinerary_items: {
            orderBy: [{ day_number: 'asc' }, { sort_order: 'asc' }]
          }
        }
      });

      return updated;
    });

    await logAction({
      userId,
      action: 'ITINERARY_UPDATED',
      entityType: 'itineraries',
      entityId: itinerary_id,
      metadata: { itemsCount: items.length, nextVersion: result.version }
    });

    res.status(200).json(result);
  } catch (err: any) {
    if (err.message === 'ITINERARY_NOT_FOUND') {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Itinerary not found.' });
    } else if (err.message === 'VERSION_CONFLICT') {
      res.status(409).json({
        code: 'VERSION_CONFLICT',
        message: 'The itinerary has been modified by another traveler. Please reload and try again.'
      });
    } else {
      console.error('Update itinerary error:', err);
      res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
    }
  }
}

// ============================================================
// BUDGET SPLIT TRACKER ENDPOINTS (who-owes-whom calculations)
// ============================================================

export async function logExpense(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Auth required.' });
      return;
    }

    const { group_id, amount, description, category, splits } = req.body;

    if (!group_id || !amount || !description || !category || !Array.isArray(splits)) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Missing required expense parameters.' });
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Amount must be greater than zero.' });
      return;
    }

    // Verify splits sum equals the total amount
    const splitSum = splits.reduce((sum, s) => sum + parseFloat(s.share_amount), 0);
    if (Math.abs(splitSum - parsedAmount) > 0.05) {
      res.status(400).json({
        code: 'SPLIT_MISMATCH',
        message: `Sum of split shares (${splitSum}) must equal the total expense amount (${parsedAmount}).`
      });
      return;
    }

    // Create Expense in database transaction
    const expense = await prisma.$transaction(async (tx) => {
      const exp = await tx.expenses.create({
        data: {
          group_id,
          paid_by: userId,
          amount: parsedAmount,
          description,
          category: category.toLowerCase(),
          split_type: 'custom'
        }
      });

      for (const s of splits) {
        await tx.expense_splits.create({
          data: {
            expense_id: exp.expense_id,
            user_id: s.user_id,
            share_amount: parseFloat(s.share_amount)
          }
        });
      }

      return exp;
    });

    await logAction({
      userId,
      action: 'EXPENSE_LOGGED',
      entityType: 'expenses',
      entityId: expense.expense_id,
      metadata: { amount: parsedAmount, category, description }
    });

    res.status(201).json({
      message: 'Expense logged successfully.',
      expense_id: expense.expense_id
    });
  } catch (err) {
    console.error('Log expense error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

export async function getGroupBalances(req: AuthenticatedRequest, res: Response) {
  try {
    const { group_id } = req.params;

    // Fetch all expenses & splits in the group
    const expenses = await prisma.expenses.findMany({
      where: { group_id },
      include: {
        expense_splits: true,
        users: {
          select: { name: true }
        }
      }
    });

    // Fetch members to initialize balance map
    const members = await prisma.group_members.findMany({
      where: { group_id },
      include: {
        users: {
          select: { name: true }
        }
      }
    });

    const nameMap = new Map<string, string>();
    const balances = new Map<string, number>();
    for (const m of members) {
      balances.set(m.user_id, 0);
      nameMap.set(m.user_id, m.users.name);
    }

    // Calculate net balance for each member: (paid_amount - split_share)
    for (const exp of expenses) {
      const payer = exp.paid_by;
      const expAmt = Number(exp.amount);

      // Add to payer
      balances.set(payer, (balances.get(payer) ?? 0) + expAmt);

      // Subtract split shares
      for (const split of exp.expense_splits) {
        const debtor = split.user_id;
        balances.set(debtor, (balances.get(debtor) ?? 0) - Number(split.share_amount));
      }
    }

    // Separate into debtors and creditors
    interface BalanceNode {
      userId: string;
      name: string;
      balance: number;
    }
    const debtors: BalanceNode[] = [];
    const creditors: BalanceNode[] = [];

    balances.forEach((bal, uid) => {
      const name = nameMap.get(uid) || 'Unknown traveler';
      if (bal < -0.01) {
        debtors.push({ userId: uid, name, balance: bal });
      } else if (bal > 0.01) {
        creditors.push({ userId: uid, name, balance: bal });
      }
    });

    // Solver: minimize transaction transfers using a greedy matcher
    const transfers: Array<{ fromId: string; fromName: string; toId: string; toName: string; amount: number }> = [];

    // Sort descending by absolute balance values
    debtors.sort((a, b) => a.balance - b.balance); // more negative first
    creditors.sort((a, b) => b.balance - a.balance); // more positive first

    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];

      const debtAmt = Math.abs(debtor.balance);
      const creditAmt = creditor.balance;

      const settlement = Math.min(debtAmt, creditAmt);

      transfers.push({
        fromId: debtor.userId,
        fromName: debtor.name,
        toId: creditor.userId,
        toName: creditor.name,
        amount: Number(settlement.toFixed(2))
      });

      debtor.balance += settlement;
      creditor.balance -= settlement;

      if (Math.abs(debtor.balance) < 0.01) dIdx++;
      if (creditor.balance < 0.01) cIdx++;
    }

    res.status(200).json({
      expenses: expenses.map(e => ({
        expense_id: e.expense_id,
        description: e.description,
        amount: Number(e.amount),
        category: e.category,
        paid_by: e.paid_by,
        paid_by_name: e.users.name,
        created_at: e.created_at
      })),
      balances: Array.from(balances.entries()).map(([userId, balance]) => ({
        userId,
        name: nameMap.get(userId) || 'Unknown',
        balance: Number(balance.toFixed(2))
      })),
      suggested_transfers: transfers
    });
  } catch (err) {
    console.error('Get balances error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

// ============================================================
// POLL ENDPOINTS
// ============================================================

export async function createPoll(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Auth required.' });
      return;
    }

    const { group_id, question, options, closes_at } = req.body;

    if (!group_id || !question || !Array.isArray(options) || options.length < 2) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Group, question, and at least 2 options are required.' });
      return;
    }

    const poll = await prisma.$transaction(async (tx) => {
      const p = await tx.polls.create({
        data: {
          group_id,
          created_by: userId,
          question,
          closes_at: closes_at ? new Date(closes_at) : null,
          status: 'open'
        }
      });

      for (let i = 0; i < options.length; i++) {
        await tx.poll_options.create({
          data: {
            poll_id: p.poll_id,
            option_text: options[i],
            sort_order: i
          }
        });
      }

      return p;
    });

    res.status(201).json({
      message: 'Poll created successfully.',
      poll_id: poll.poll_id
    });
  } catch (err) {
    console.error('Create poll error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

export async function castVote(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Auth required.' });
      return;
    }

    const { poll_id } = req.params;
    const { option_id } = req.body;

    if (!option_id) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Option ID is required to cast vote.' });
      return;
    }

    // Verify if poll exists and is open
    const poll = await prisma.polls.findUnique({
      where: { poll_id }
    });

    if (!poll) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Poll not found.' });
      return;
    }

    if (poll.status === 'closed' || (poll.closes_at && new Date() > poll.closes_at)) {
      res.status(400).json({ code: 'POLL_CLOSED', message: 'Voting has closed for this poll.' });
      return;
    }

    // Upsert vote
    await prisma.poll_votes.upsert({
      where: {
        poll_id_user_id: { poll_id, user_id: userId }
      },
      update: { option_id, voted_at: new Date() },
      create: { poll_id, option_id, user_id: userId }
    });

    res.status(200).json({ message: 'Vote recorded successfully.' });
  } catch (err) {
    console.error('Cast vote error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

export async function getGroupPolls(req: AuthenticatedRequest, res: Response) {
  try {
    const { group_id } = req.params;

    const polls = await prisma.polls.findMany({
      where: { group_id },
      include: {
        poll_options: {
          include: {
            poll_votes: {
              include: {
                users: { select: { name: true } }
              }
            }
          },
          orderBy: { sort_order: 'asc' }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    const response = polls.map(p => ({
      poll_id: p.poll_id,
      question: p.question,
      closes_at: p.closes_at,
      status: p.status,
      created_at: p.created_at,
      options: p.poll_options.map(opt => ({
        option_id: opt.option_id,
        text: opt.option_text,
        votes_count: opt.poll_votes.length,
        voters: opt.poll_votes.map(v => v.users.name)
      }))
    }));

    res.status(200).json(response);
  } catch (err) {
    console.error('Get group polls error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}
