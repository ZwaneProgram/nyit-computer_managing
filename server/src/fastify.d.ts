import '@fastify/cookie';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the requireAuth() preHandler guard. */
    user?: {
      id: number;
      username: string;
      full_name: string | null;
    };
  }
}
