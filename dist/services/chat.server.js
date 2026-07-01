"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initChatServer = initChatServer;
const ws_1 = __importDefault(require("ws"));
const url = __importStar(require("url"));
const jwt = __importStar(require("jsonwebtoken"));
const client_1 = require("../db/client");
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'travelmate_access_secret_key_123!';
// Map of groupId -> Set of ActiveSessions
const activeGroups = new Map();
function initChatServer(server) {
    const wss = new ws_1.default.Server({ noServer: true });
    // Handle server upgrade request and authenticate
    server.on('upgrade', (request, socket, head) => {
        const parsedUrl = url.parse(request.url || '', true);
        if (parsedUrl.pathname !== '/chat') {
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
            return;
        }
        const token = parsedUrl.query.token;
        if (!token) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        try {
            const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
            const userId = decoded.sub;
            if (!userId) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, userId);
            });
        }
        catch (err) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
        }
    });
    // Handle successful connections
    wss.on('connection', async (ws, request, userId) => {
        try {
            // Find user details & active group from Database
            const user = await client_1.prisma.users.findUnique({
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
            const session = {
                userId,
                userName: user.name,
                groupId,
                ws
            };
            // Register session in map
            if (!activeGroups.has(groupId)) {
                activeGroups.set(groupId, new Set());
            }
            activeGroups.get(groupId).add(session);
            console.log(`[WebSocket] User ${user.name} connected to Group ${groupId}`);
            // Broadcast join notification
            broadcast(groupId, {
                type: 'system',
                message: `${user.name} has joined the chat.`,
                sent_at: new Date().toISOString()
            });
            // Listen for client messages
            ws.on('message', (messageRaw) => {
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
                }
                catch (err) {
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
        }
        catch (err) {
            console.error('[WebSocket error]', err);
            ws.close();
        }
    });
}
// Broadcast helper to target specific group members
function broadcast(groupId, data) {
    const sessions = activeGroups.get(groupId);
    if (!sessions)
        return;
    const payload = JSON.stringify(data);
    for (const session of sessions) {
        if (session.ws.readyState === ws_1.default.OPEN) {
            session.ws.send(payload);
        }
    }
}
