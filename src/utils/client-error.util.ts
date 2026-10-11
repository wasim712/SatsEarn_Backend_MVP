const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

// Services signal user-facing problems with plain `new Error('...')` ("Insufficient available
// balance.", etc.), and those messages are meant for the client. Anything else (Prisma errors,
// axios/OpenAI/Cloudinary failures, TypeErrors from bugs) can carry table names, hosts or stack
// details, so it is logged here and replaced with a generic message.
export function clientErrorMessage(error: unknown, fallback = GENERIC_MESSAGE): string {
  if (error instanceof Error && error.constructor === Error && error.message) {
    return error.message;
  }

  console.error('[internal error]', error);
  return fallback;
}
