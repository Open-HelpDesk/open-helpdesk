import { desk_portal_fr } from "./portal/fr";
import { desk_it_fr } from "./it/fr";
import { desk_ee_fr } from "./ee/fr";
import { desk_cfg_fr } from "./cfg/fr";
import { desk_domain_fr } from "./domain/fr";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_fr = { ...desk_portal_fr, ...desk_it_fr, ...desk_ee_fr, ...desk_cfg_fr, ...desk_domain_fr };
