/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** The signed-in person, or null. Set by the middleware. */
    person: import('./lib/db').Person | null;
    /** The signed-in account's id, or null. */
    userId: string | null;
    /** Set only for the organizer who chose to see the site as another kind of account. Changes what is drawn, nothing else. */
    viewAs: import('./lib/viewAs').ViewAs | null;
  }
}
