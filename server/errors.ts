import { GraphQLError } from "graphql";

export class PublicError extends GraphQLError {
  constructor(message: string, status = 400, code = "BAD_USER_INPUT") {
    super(message, { extensions: { code, http: { status } } });
  }
}

export function errorStatus(error: unknown) {
  return error instanceof PublicError
    ? Number(error.extensions.http && (error.extensions.http as { status: number }).status)
    : 500;
}
