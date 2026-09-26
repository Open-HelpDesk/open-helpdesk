import { desk_portal_sv } from "./portal/sv";
import { desk_it_sv } from "./it/sv";
import { desk_ee_sv } from "./ee/sv";
import { desk_cfg_sv } from "./cfg/sv";
import { desk_domain_sv } from "./domain/sv";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_sv = { ...desk_portal_sv, ...desk_it_sv, ...desk_ee_sv, ...desk_cfg_sv, ...desk_domain_sv };
