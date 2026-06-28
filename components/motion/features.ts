/**
 * The full DOM feature set for framer-motion's LazyMotion, split into its own
 * chunk. `domMax` (not `domAnimation`) because the app uses shared-layout
 * animations (`layoutId` nav pills, preset rings). Imported dynamically by
 * MotionProvider so this ~30KB feature bundle loads after hydration instead of
 * shipping in every page's critical-path JS.
 */
import { domMax } from "framer-motion";

export default domMax;
