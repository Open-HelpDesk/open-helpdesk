import { desk_portal_ro } from "./portal/ro";
import { desk_it_ro } from "./it/ro";
import { desk_ee_ro } from "./ee/ro";
import { desk_cfg_ro } from "./cfg/ro";
import { desk_domain_ro } from "./domain/ro";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_ro = { ...desk_portal_ro, ...desk_it_ro, ...desk_ee_ro, ...desk_cfg_ro, ...desk_domain_ro };
