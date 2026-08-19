/**
 * Garde des server actions de l'administration.
 *
 * La définition vit dans lib/session : la même frontière de rôle sert aussi à
 * l'écriture dans la base de connaissances, qui n'a rien à voir avec les
 * réglages. Ce module la réexporte pour ne pas casser les imports existants.
 */
export { requireManager } from "@/lib/session";
