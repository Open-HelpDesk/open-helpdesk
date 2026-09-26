import { desk_portal_lv } from "./portal/lv";
import { desk_it_lv } from "./it/lv";
import { desk_ee_lv } from "./ee/lv";
import { desk_cfg_lv } from "./cfg/lv";
import { desk_domain_lv } from "./domain/lv";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_lv = { ...desk_portal_lv, ...desk_it_lv, ...desk_ee_lv, ...desk_cfg_lv, ...desk_domain_lv };
