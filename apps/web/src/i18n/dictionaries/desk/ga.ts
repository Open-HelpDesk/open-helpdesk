import { desk_portal_ga } from "./portal/ga";
import { desk_it_ga } from "./it/ga";
import { desk_ee_ga } from "./ee/ga";
import { desk_cfg_ga } from "./cfg/ga";
import { desk_domain_ga } from "./domain/ga";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_ga = { ...desk_portal_ga, ...desk_it_ga, ...desk_ee_ga, ...desk_cfg_ga, ...desk_domain_ga };
