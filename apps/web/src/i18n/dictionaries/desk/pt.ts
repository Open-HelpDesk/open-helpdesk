import { desk_portal_pt } from "./portal/pt";
import { desk_it_pt } from "./it/pt";
import { desk_ee_pt } from "./ee/pt";
import { desk_cfg_pt } from "./cfg/pt";
import { desk_domain_pt } from "./domain/pt";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_pt = { ...desk_portal_pt, ...desk_it_pt, ...desk_ee_pt, ...desk_cfg_pt, ...desk_domain_pt };
