import { desk_portal_et } from "./portal/et";
import { desk_it_et } from "./it/et";
import { desk_ee_et } from "./ee/et";
import { desk_cfg_et } from "./cfg/et";
import { desk_domain_et } from "./domain/et";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_et = { ...desk_portal_et, ...desk_it_et, ...desk_ee_et, ...desk_cfg_et, ...desk_domain_et };
