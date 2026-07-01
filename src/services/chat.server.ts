import { Server as HTTPServer } from 'http';
import WebSocket from 'ws';
import * as url from 'url';
import * as jwt from 'jsonwebtoken';
import { prisma } from '../db/client';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'travelmate_access_secret_key_123!';

interface ActiveSession {
  userId: string;
  userName: string;
  groupId: string;
  ws: WebSocket;
}

// Map of groupId -> Set of ActiveSessions
const activeGroups = new Map<string, Set<ActiveSession>>();

export function initChatServer(server: HTTPServer) {
  const wss = new WebSocket.Server({ noServer: true });

  // Handle server upgrade request and authenticate
  server.on('upgrade', (request, socket, head) => {
    const parsedUrl = url.parse(request.url || '', true);
    
    if (parsedUrl.pathname !== '/chat') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const token = parsedUrl.query.token as string;
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as any;
      const userId = decoded.sub;

      if (!userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, userId);
      });
    } catch (err) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  // Handle successful connections
  wss.on('connection', async (ws: WebSocket, request: any, userId: string) => {
    try {
      // Find user details & active group from Database
      const user = await prisma.users.findUnique({
        where: { user_id: userId },
        include: {
          group_members: {
            where: { status: 'accepted' }
          }
        }
      });

      if (!user) {
        ws.send(JSON.stringify({ code: 'ERROR', message: 'User record not found.' }));
        ws.close();
        return;
      }

      const activeMember = user.group_members[0];
      if (!activeMember) {
        ws.send(JSON.stringify({ code: 'ERROR', message: 'You are not active in any confirmed travel group.' }));
        ws.close();
        return;
      }

      const groupId = activeMember.group_id;
      const session: ActiveSession = {
        userId,
        userName: user.name,
        groupId,
        ws
      };

      // Register session in map
      if (!activeGroups.has(groupId)) {
        activeGroups.set(groupId, new Set());
      }
      activeGroups.get(groupId)!.add(session);

      console.log(`[WebSocket] User ${user.name} connected to Group ${groupId}`);

      // Broadcast join notification
      broadcast(groupId, {
        type: 'system',
        message: `${user.name} has joined the chat.`,
        sent_at: new Date().toISOString()
      });

      // Listen for client messages
      ws.on('message', (messageRaw: string) => {
        try {
          const parsed = JSON.parse(messageRaw);
          if (parsed.type === 'message' && parsed.text) {
            broadcast(groupId, {
              type: 'message',
              userId,
              senderName: user.name,
              text: parsed.text,
              sent_at: new Date().toISOString()
            });
          }
        } catch (err) {
          // ignore invalid frames
        }
      });

      // Handle socket closure
      ws.on('close', () => {
        const groupSessions = activeGroups.get(groupId);
        if (groupSessions) {
          groupSessions.delete(session);
          if (groupSessions.size === 0) {
            activeGroups.delete(groupId);
          }
        }
        console.log(`[WebSocket] User ${user.name} disconnected.`);
        
        broadcast(groupId, {
          type: 'system',
          message: `${user.name} has left the chat.`,
          sent_at: new Date().toISOString()
        });
      });

    } catch (err) {
      console.error('[WebSocket error]', err);
      ws.close();
    }
  });
}

// Broadcast helper to target specific group members
function broadcast(groupId: string, data: any) {
  const sessions = activeGroups.get(groupId);
  if (!sessions) return;

  const payload = JSON.stringify(data);
  for (const session of sessions) {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(payload);
    }
  }
}
