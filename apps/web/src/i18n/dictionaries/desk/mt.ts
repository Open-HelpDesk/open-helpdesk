import { desk_portal_mt } from "./portal/mt";
import { desk_it_mt } from "./it/mt";
import { desk_ee_mt } from "./ee/mt";
import { desk_cfg_mt } from "./cfg/mt";
import { desk_domain_mt } from "./domain/mt";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_mt = { ...desk_portal_mt, ...desk_it_mt, ...desk_ee_mt, ...desk_cfg_mt, ...desk_domain_mt };
