/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** The signed-in person, or null. Set by the middleware. */
    person: import('./lib/db').Person | null;
    /** The signed-in account's id (GitHub, GitLab or email), or null. */
    userId: string | null;
    /** A person who signed in with an email link, or null. Never set when `person` is. */
    backer: import('./lib/backers').Backer | null;
  }
}
