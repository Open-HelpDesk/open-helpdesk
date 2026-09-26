import { desk_portal_nl } from "./portal/nl";
import { desk_it_nl } from "./it/nl";
import { desk_ee_nl } from "./ee/nl";
import { desk_cfg_nl } from "./cfg/nl";
import { desk_domain_nl } from "./domain/nl";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_nl = { ...desk_portal_nl, ...desk_it_nl, ...desk_ee_nl, ...desk_cfg_nl, ...desk_domain_nl };
