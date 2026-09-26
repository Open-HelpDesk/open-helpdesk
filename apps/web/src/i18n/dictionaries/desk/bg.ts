import { desk_portal_bg } from "./portal/bg";
import { desk_it_bg } from "./it/bg";
import { desk_ee_bg } from "./ee/bg";
import { desk_cfg_bg } from "./cfg/bg";
import { desk_domain_bg } from "./domain/bg";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_bg = { ...desk_portal_bg, ...desk_it_bg, ...desk_ee_bg, ...desk_cfg_bg, ...desk_domain_bg };
