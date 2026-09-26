import { desk_portal_nb } from "./portal/nb";
import { desk_it_nb } from "./it/nb";
import { desk_ee_nb } from "./ee/nb";
import { desk_cfg_nb } from "./cfg/nb";
import { desk_domain_nb } from "./domain/nb";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_nb = { ...desk_portal_nb, ...desk_it_nb, ...desk_ee_nb, ...desk_cfg_nb, ...desk_domain_nb };
