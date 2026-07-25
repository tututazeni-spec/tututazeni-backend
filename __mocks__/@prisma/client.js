'use strict';

class PrismaClient {
  $connect() {
    return Promise.resolve();
  }
  $disconnect() {
    return Promise.resolve();
  }
  $on() {}
  $use() {}
  $extends() {
    return this;
  }
}

const Prisma = {
  PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
    constructor(message, { code, clientVersion } = {}) {
      super(message);
      this.code = code;
      this.clientVersion = clientVersion;
    }
  },
  PrismaClientValidationError: class PrismaClientValidationError extends Error {},
  PrismaClientInitializationError: class PrismaClientInitializationError extends Error {},
};

module.exports = { PrismaClient, Prisma };
