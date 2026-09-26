import { desk_portal_sl } from "./portal/sl";
import { desk_it_sl } from "./it/sl";
import { desk_ee_sl } from "./ee/sl";
import { desk_cfg_sl } from "./cfg/sl";
import { desk_domain_sl } from "./domain/sl";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_sl = { ...desk_portal_sl, ...desk_it_sl, ...desk_ee_sl, ...desk_cfg_sl, ...desk_domain_sl };
