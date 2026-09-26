import { desk_portal_da } from "./portal/da";
import { desk_it_da } from "./it/da";
import { desk_ee_da } from "./ee/da";
import { desk_cfg_da } from "./cfg/da";
import { desk_domain_da } from "./domain/da";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_da = { ...desk_portal_da, ...desk_it_da, ...desk_ee_da, ...desk_cfg_da, ...desk_domain_da };
