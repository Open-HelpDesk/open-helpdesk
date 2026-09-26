import { desk_portal_hr } from "./portal/hr";
import { desk_it_hr } from "./it/hr";
import { desk_ee_hr } from "./ee/hr";
import { desk_cfg_hr } from "./cfg/hr";
import { desk_domain_hr } from "./domain/hr";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_hr = { ...desk_portal_hr, ...desk_it_hr, ...desk_ee_hr, ...desk_cfg_hr, ...desk_domain_hr };
