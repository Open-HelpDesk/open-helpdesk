import { desk_portal_lt } from "./portal/lt";
import { desk_it_lt } from "./it/lt";
import { desk_ee_lt } from "./ee/lt";
import { desk_cfg_lt } from "./cfg/lt";
import { desk_domain_lt } from "./domain/lt";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_lt = { ...desk_portal_lt, ...desk_it_lt, ...desk_ee_lt, ...desk_cfg_lt, ...desk_domain_lt };
