import { desk_portal_en } from "./portal/en";
import { desk_it_en } from "./it/en";
import { desk_ee_en } from "./ee/en";
import { desk_cfg_en } from "./cfg/en";
import { desk_domain_en } from "./domain/en";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_en = { ...desk_portal_en, ...desk_it_en, ...desk_ee_en, ...desk_cfg_en, ...desk_domain_en };
