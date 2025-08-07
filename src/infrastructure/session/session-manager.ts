/**
 * Session state management for stateful MCP interactions
 */

export interface SessionState {
  sessionId: string;
  currentTemplate?: string;
  lastAnalysis?: any;
  userContext?: {
    environment?: string;
    complianceRequirements?: string[];
    namingConventions?: Record<string, string>;
  };
  createdAt: number;
  lastAccessedAt: number;
}

export class SessionManager {
  private sessions: Map<string, SessionState> = new Map();
  private readonly sessionTimeout: number = 3600000; // 1 hour

  constructor(sessionTimeout?: number) {
    if (sessionTimeout) {
      this.sessionTimeout = sessionTimeout;
    }
  }

  createSession(): string {
    const sessionId = this.generateSessionId();
    const now = Date.now();
    
    const session: SessionState = {
      sessionId,
      createdAt: now,
      lastAccessedAt: now
    };

    this.sessions.set(sessionId, session);
    return sessionId;
  }

  getSession(sessionId: string): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return undefined;
    }

    // Check if session has expired
    if (Date.now() - session.lastAccessedAt > this.sessionTimeout) {
      this.sessions.delete(sessionId);
      return undefined;
    }

    // Update last accessed time
    session.lastAccessedAt = Date.now();
    return session;
  }

  updateSession(sessionId: string, updates: Partial<SessionState>): boolean {
    const session = this.getSession(sessionId);
    
    if (!session) {
      return false;
    }

    Object.assign(session, updates, {
      lastAccessedAt: Date.now()
    });

    return true;
  }

  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  cleanup(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastAccessedAt > this.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => this.sessions.delete(sessionId));
  }

  getActiveSessions(): number {
    this.cleanup(); // Clean up expired sessions first
    return this.sessions.size;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}