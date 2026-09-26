import { desk_portal_hu } from "./portal/hu";
import { desk_it_hu } from "./it/hu";
import { desk_ee_hu } from "./ee/hu";
import { desk_cfg_hu } from "./cfg/hu";
import { desk_domain_hu } from "./domain/hu";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_hu = { ...desk_portal_hu, ...desk_it_hu, ...desk_ee_hu, ...desk_cfg_hu, ...desk_domain_hu };
