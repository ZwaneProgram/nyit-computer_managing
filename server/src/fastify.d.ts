import '@fastify/cookie';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the requireAuth() / requireOwner() preHandler guards. */
    user?: {
      id: number;
      username: string;
      full_name: string | null;
      role: 'owner' | 'staff';
    };
  }
}
