import { desk_portal_pl } from "./portal/pl";
import { desk_it_pl } from "./it/pl";
import { desk_ee_pl } from "./ee/pl";
import { desk_cfg_pl } from "./cfg/pl";
import { desk_domain_pl } from "./domain/pl";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_pl = { ...desk_portal_pl, ...desk_it_pl, ...desk_ee_pl, ...desk_cfg_pl, ...desk_domain_pl };
