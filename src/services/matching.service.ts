import { prisma } from '../db/client';
import { logAction } from './audit.service';

interface Candidate {
  userId: string;
  tripId: string;
  name: string;
  age: number;
  gender: string;
  gender_preference: string;
  destination: string;
  start_date: Date;
  end_date: Date;
  budget_tier: string;
  interests: string[];
  travel_styles: string[];
  languages: string[];
  trust_score: number;
}

// Jaccard similarity helper
function jaccardSimilarity(arrA: string[], arrB: string[]): number {
  const setA = new Set(arrA.map(x => x.toLowerCase().trim()));
  const setB = new Set(arrB.map(x => x.toLowerCase().trim()));
  
  if (setA.size === 0 && setB.size === 0) return 0;
  
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  
  return intersection.size / union.size;
}

// Cosine similarity for text array vectors
function cosineSimilarity(arrA: string[], arrB: string[]): number {
  const setA = new Set(arrA.map(x => x.toLowerCase().trim()));
  const setB = new Set(arrB.map(x => x.toLowerCase().trim()));
  
  if (setA.size === 0 || setB.size === 0) return 0;
  
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  return intersection.size / Math.sqrt(setA.size * setB.size);
}

// Calculate pairwise score
export function calculatePairwiseScore(uA: Candidate, uB: Candidate): number {
  // 1. Date Overlap (0.30 weight)
  const startA = uA.start_date.getTime();
  const endA = uA.end_date.getTime();
  const startB = uB.start_date.getTime();
  const endB = uB.end_date.getTime();

  const overlapMs = Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
  const totalDaysMs = Math.max(endA - startA, endB - startB);
  const dateScore = totalDaysMs > 0 ? Math.min(1.0, overlapMs / totalDaysMs) : 0;

  // 2. Interest Similarity (0.20 weight)
  const interestScore = jaccardSimilarity(uA.interests, uB.interests);

  // 3. Budget Match (0.15 weight)
  const budgetTiers: Record<string, number> = { low: 0, mid: 1, high: 2 };
  const tierA = budgetTiers[uA.budget_tier.toLowerCase()] ?? 1;
  const tierB = budgetTiers[uB.budget_tier.toLowerCase()] ?? 1;
  const budgetDiff = Math.abs(tierA - tierB);
  const budgetScore = budgetDiff === 0 ? 1.0 : budgetDiff === 1 ? 0.5 : 0;

  // 4. Travel Style (0.10 weight)
  const styleScore = cosineSimilarity(uA.travel_styles, uB.travel_styles);

  // 5. Age Compatibility (0.10 weight)
  const maxAgeDiff = 30;
  const ageDiff = Math.abs(uA.age - uB.age);
  const ageScore = Math.max(0, 1 - (ageDiff / maxAgeDiff));

  // 6. Language Similarity (0.05 weight)
  const langScore = jaccardSimilarity(uA.languages, uB.languages);

  // 7. Ratings (0.05 weight) - Defaults to 1.0 if not rated
  const ratingScore = 1.0;

  // 8. Trust Score (0.05 weight)
  const trustScore = (uA.trust_score + uB.trust_score) / 2;

  // Weighted sum
  return (
    0.30 * dateScore +
    0.20 * interestScore +
    0.15 * budgetScore +
    0.10 * styleScore +
    0.10 * ageScore +
    0.05 * langScore +
    0.05 * ratingScore +
    0.05 * trustScore
  );
}

// Enforces gender-preference constraint
function checkGenderConstraint(candidate: Candidate, group: Candidate[]): boolean {
  // Clone group and add candidate
  const tempGroup = [...group, candidate];
  
  // Extract genders and gender preferences
  const genders = tempGroup.map(m => m.gender);
  const prefs = tempGroup.map(m => m.gender_preference);

  // If anyone has 'women-only' preference, group must be 100% female
  if (prefs.includes('women-only')) {
    if (genders.some(g => g !== 'F')) {
      return false;
    }
  }

  // If anyone has 'men-only' preference, group must be 100% male
  if (prefs.includes('men-only')) {
    if (genders.some(g => g !== 'M')) {
      return false;
    }
  }

  // Enforce individual member restrictions based on existing group makeup
  for (const m of tempGroup) {
    if (m.gender_preference === 'women-only' && genders.some(g => g !== 'F')) return false;
    if (m.gender_preference === 'men-only' && genders.some(g => g !== 'M')) return false;
  }

  return true;
}

// Compute average compatibility score for a group
function getGroupCompatibility(groupIds: string[], scoreMap: Map<string, number>): number {
  if (groupIds.length <= 1) return 1.0;
  let totalScore = 0;
  let pairs = 0;
  for (let i = 0; i < groupIds.length; i++) {
    for (let j = i + 1; j < groupIds.length; j++) {
      const uA = groupIds[i];
      const uB = groupIds[j];
      const key = uA < uB ? `${uA}_${uB}` : `${uB}_${uA}`;
      totalScore += scoreMap.get(key) ?? 0.5;
      pairs++;
    }
  }
  return totalScore / pairs;
}

export async function runMatchingProcess(): Promise<number> {
  // Use a Postgres transaction-scoped advisory lock (Key: 1337)
  // This locks execution system-wide and releases automatically when transaction finishes
  return await prisma.$transaction(async (tx) => {
    const lockResult = await tx.$queryRaw<any[]>`SELECT pg_try_advisory_xact_lock(1337) as locked`;
    if (!lockResult[0]?.locked) {
      console.warn('[Matching Process] Locked. A matching process is already running.');
      return 0;
    }

    console.log('[Matching Process] Lock obtained. Fetching open trips...');

    // Fetch all open trips and users (exclude soft-deleted or unverified users if verification is hard constraint)
    // FR-25: Unverified users can browse, can't get matched
    const openTrips = await tx.trips.findMany({
      where: {
        status: 'open',
        users: {
          deleted_at: null,
          verification_status: 'verified' // Verify filter
        }
      },
      include: {
        users: {
          include: {
            user_profiles: true
          }
        }
      }
    });

    if (openTrips.length === 0) {
      console.log('[Matching Process] No open verified trips to match.');
      return 0;
    }

    // Map DB records to Candidate interface
    const candidates: Candidate[] = openTrips.map(t => {
      const u = t.users;
      const prof = u.user_profiles[0];
      return {
        userId: u.user_id,
        tripId: t.trip_id,
        name: u.name,
        age: u.age ?? 25,
        gender: u.gender ?? 'Other',
        gender_preference: u.gender_preference ?? 'mixed',
        destination: t.destination,
        start_date: t.start_date,
        end_date: t.end_date,
        budget_tier: t.budget_tier ?? 'mid',
        interests: prof?.interests ?? [],
        travel_styles: u.travel_styles ?? [],
        languages: u.languages ?? [],
        trust_score: Number(u.trust_score)
      };
    });

    // Group candidates by destination (case-insensitive normalized)
    const destGroups = new Map<string, Candidate[]>();
    for (const c of candidates) {
      const key = c.destination.toLowerCase().trim();
      if (!destGroups.has(key)) destGroups.set(key, []);
      destGroups.get(key)!.push(c);
    }

    let groupsFormedCount = 0;
    const scoreMap = new Map<string, number>();

    // Process each destination separately
    for (const [dest, pool] of destGroups.entries()) {
      if (pool.length < 4) continue; // Min size is 4

      console.log(`[Matching Process] Matching ${pool.length} candidates for ${dest}...`);

      // Pre-calculate pairwise compatibilities and store/cache them
      for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          const uA = pool[i];
          const uB = pool[j];
          const score = calculatePairwiseScore(uA, uB);
          const key = uA.userId < uB.userId ? `${uA.userId}_${uB.userId}` : `${uB.userId}_${uA.userId}`;
          scoreMap.set(key, score);

          // Cache in UserCompatibility table
          const userAId = uA.userId < uB.userId ? uA.userId : uB.userId;
          const userBId = uA.userId < uB.userId ? uB.userId : uA.userId;
          await tx.user_compatibility.upsert({
            where: {
              user_a_id_user_b_id: { user_a_id: userAId, user_b_id: userBId }
            },
            update: {
              compatibility_score: score,
              computed_at: new Date()
            },
            create: {
              user_a_id: userAId,
              user_b_id: userBId,
              compatibility_score: score
            }
          });
        }
      }

      // Compute compatibility potential for each user (sum of score with other candidates)
      const potentialMap = new Map<string, number>();
      for (const u of pool) {
        let potential = 0;
        for (const other of pool) {
          if (u.userId === other.userId) continue;
          const key = u.userId < other.userId ? `${u.userId}_${other.userId}` : `${other.userId}_${u.userId}`;
          potential += scoreMap.get(key) ?? 0.5;
        }
        potentialMap.set(u.userId, potential);
      }

      // Sort candidates by potential descending
      const candidatesSorted = [...pool].sort((a, b) => (potentialMap.get(b.userId) ?? 0) - (potentialMap.get(a.userId) ?? 0));
      const remainingIds = new Set(candidatesSorted.map(u => u.userId));
      const candidatesMap = new Map<string, Candidate>(pool.map(c => [c.userId, c]));

      const formedGroups: string[][] = [];

      // Greedy packing
      while (remainingIds.size >= 4) {
        // Find seed with highest potential among remaining
        let seedId = '';
        let maxPot = -1;
        for (const rid of remainingIds) {
          const pot = potentialMap.get(rid) ?? 0;
          if (pot > maxPot) {
            maxPot = pot;
            seedId = rid;
          }
        }

        remainingIds.delete(seedId);
        const group: string[] = [seedId];

        // Grow group
        while (group.length < 8 && remainingIds.size > 0) {
          let bestId = '';
          let bestScore = -1;

          for (const rid of remainingIds) {
            const candidate = candidatesMap.get(rid)!;
            const groupMembers = group.map(id => candidatesMap.get(id)!);

            // Enforce gender constraints
            if (!checkGenderConstraint(candidate, groupMembers)) {
              continue;
            }

            // Calculate average compatibility with current group members
            let sumScore = 0;
            for (const gid of group) {
              const key = rid < gid ? `${rid}_${gid}` : `${gid}_${rid}`;
              sumScore += scoreMap.get(key) ?? 0.5;
            }
            const avgScore = sumScore / group.length;

            if (avgScore > bestScore) {
              bestScore = avgScore;
              bestId = rid;
            }
          }

          // Add to group if passes minimum threshold
          if (bestId && bestScore >= 0.3) {
            group.push(bestId);
            remainingIds.delete(bestId);
          } else {
            break;
          }
        }

        // Validate min size
        if (group.length >= 4) {
          formedGroups.push(group);
        } else {
          // Return candidates back to pool
          for (const id of group) {
            remainingIds.add(id);
          }
          break;
        }
      }

      // Local Swap Optimization (Iterate 5 times max)
      for (let iter = 0; iter < 5; iter++) {
        let improved = false;
        for (let i = 0; i < formedGroups.length; i++) {
          for (let j = i + 1; j < formedGroups.length; j++) {
            const groupI = formedGroups[i];
            const groupJ = formedGroups[j];

            for (let idxI = 0; idxI < groupI.length; idxI++) {
              for (let idxJ = 0; idxJ < groupJ.length; idxJ++) {
                const uI = groupI[idxI];
                const uJ = groupJ[idxJ];

                const candI = candidatesMap.get(uI)!;
                const candJ = candidatesMap.get(uJ)!;

                // Create test swap groups
                const testGroupI = groupI.map(id => id === uI ? uJ : id);
                const testGroupJ = groupJ.map(id => id === uJ ? uI : id);

                // Enforce gender constraints for both swapped groups
                const candGroupI = testGroupI.map(id => candidatesMap.get(id)!);
                const candGroupJ = testGroupJ.map(id => candidatesMap.get(id)!);

                if (!checkGenderConstraint(candidatesMap.get(uJ)!, groupI.filter(id => id !== uI).map(id => candidatesMap.get(id)!))) continue;
                if (!checkGenderConstraint(candidatesMap.get(uI)!, groupJ.filter(id => id !== uJ).map(id => candidatesMap.get(id)!))) continue;

                const oldCohesion = getGroupCompatibility(groupI, scoreMap) + getGroupCompatibility(groupJ, scoreMap);
                const newCohesion = getGroupCompatibility(testGroupI, scoreMap) + getGroupCompatibility(testGroupJ, scoreMap);

                // 5% improvement threshold
                if (newCohesion > oldCohesion * 1.05) {
                  formedGroups[i] = testGroupI;
                  formedGroups[j] = testGroupJ;
                  improved = true;
                  break;
                }
              }
              if (improved) break;
            }
            if (improved) break;
          }
          if (improved) break;
        }
        if (!improved) break;
      }

      // Save groups into database and write relations
      for (const group of formedGroups) {
        // Form the Group
        const firstCandidate = candidatesMap.get(group[0])!;
        
        // Find destination_id if exists
        const destRecord = await tx.destinations.findFirst({
          where: { name: { equals: firstCandidate.destination, mode: 'insensitive' } }
        });

        const newGroup = await tx.groups.create({
          data: {
            destination_id: destRecord?.destination_id || null,
            destination: firstCandidate.destination,
            start_date: new Date(Math.min(...group.map(id => candidatesMap.get(id)!.start_date.getTime()))),
            end_date: new Date(Math.max(...group.map(id => candidatesMap.get(id)!.end_date.getTime()))),
            size: group.length,
            status: 'forming'
          }
        });

        // Pair accountability buddies (P1: FR-21 trip buddy sub-pairing of 2)
        // Sort group members by compatibility to pair adjacent ones
        const buddiesMap = new Map<string, string>(); // user_id -> buddy role/id
        const sortedIds = [...group].sort((a, b) => {
          const key = a < b ? `${a}_${b}` : `${b}_${a}`;
          return (scoreMap.get(key) ?? 0.5) - 0.5;
        });

        for (let idx = 0; idx < sortedIds.length; idx += 2) {
          if (idx + 1 < sortedIds.length) {
            buddiesMap.set(sortedIds[idx], sortedIds[idx + 1]);
            buddiesMap.set(sortedIds[idx + 1], sortedIds[idx]);
          }
        }

        // Add members to GroupMembers and Matches
        for (const uid of group) {
          const cand = candidatesMap.get(uid)!;

          // Compute member average compatibility
          let totalScore = 0;
          let count = 0;
          for (const otherId of group) {
            if (uid === otherId) continue;
            const key = uid < otherId ? `${uid}_${otherId}` : `${otherId}_${uid}`;
            totalScore += scoreMap.get(key) ?? 0.5;
            count++;
          }
          const memberCompat = count > 0 ? totalScore / count : 1.0;

          // Insert membership
          const isBuddy = buddiesMap.has(uid);
          await tx.group_members.create({
            data: {
              group_id: newGroup.group_id,
              user_id: uid,
              compatibility_score: memberCompat,
              role: isBuddy ? 'trip_buddy' : 'member',
              status: 'pending' // Initial lifecycle status
            }
          });

          // Insert Match record
          await tx.matches.create({
            data: {
              group_id: newGroup.group_id,
              user_id: uid,
              compatibility_score: memberCompat
            }
          });

          // Update user trip request status to matched
          await tx.trips.update({
            where: { trip_id: cand.tripId },
            data: { status: 'matched' }
          });
        }

        // Initialize empty collaborative itinerary for the group (FR-26)
        const itinerary = await tx.itineraries.create({
          data: {
            group_id: newGroup.group_id,
            destination_id: destRecord?.destination_id || null,
            version: 1
          }
        });

        // Seed itinerary items from templates if available
        if (destRecord) {
          const templates = await tx.destination_template_items.findMany({
            where: { destination_id: destRecord.destination_id },
            orderBy: { sort_order: 'asc' }
          });
          for (const item of templates) {
            await tx.itinerary_items.create({
              data: {
                itinerary_id: itinerary.itinerary_id,
                day_number: item.day_number,
                title: item.title,
                description: item.description,
                sort_order: item.sort_order
              }
            });
          }
        }

        groupsFormedCount++;
        await logAction({
          action: 'GROUP_FORMED',
          entityType: 'groups',
          entityId: newGroup.group_id,
          metadata: { memberCount: group.length, destination: firstCandidate.destination }
        });
      }
    }

    console.log(`[Matching Process] Matching job completed successfully. Formed ${groupsFormedCount} groups.`);
    return groupsFormedCount;
  });
}
