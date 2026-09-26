import { desk_portal_de } from "./portal/de";
import { desk_it_de } from "./it/de";
import { desk_ee_de } from "./ee/de";
import { desk_cfg_de } from "./cfg/de";
import { desk_domain_de } from "./domain/de";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_de = { ...desk_portal_de, ...desk_it_de, ...desk_ee_de, ...desk_cfg_de, ...desk_domain_de };
