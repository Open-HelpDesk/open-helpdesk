import { desk_portal_fi } from "./portal/fi";
import { desk_it_fi } from "./it/fi";
import { desk_ee_fi } from "./ee/fi";
import { desk_cfg_fi } from "./cfg/fi";
import { desk_domain_fi } from "./domain/fi";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_fi = { ...desk_portal_fi, ...desk_it_fi, ...desk_ee_fi, ...desk_cfg_fi, ...desk_domain_fi };
