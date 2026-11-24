// egregore-omp adapter. Installed by https://github.com/pedrotaciano/egregore-omp
// omp auto-discovers .omp/extensions, not .pi/extensions, so this file loads
// the Pi extension that create-egregore generates and bridges two event gaps.
import egregore from "../../.pi/extensions/egregore.ts";

// Pi event name -> omp event name.
const EVENT_ALIASES = { agent_settled: "agent_end" };

export default function egregoreOmp(pi) {
	const on = pi.on.bind(pi);
	const adapted = new Proxy(pi, {
		get(target, key) {
			if (key !== "on") {
				const value = Reflect.get(target, key);
				return typeof value === "function" ? value.bind(target) : value;
			}
			return (event, handler) => {
				// omp fires session_start once, on initial load, without Pi's
				// reason field; Pi's handler skips the team greeting and the
				// native session binding unless reason is "startup".
				if (event === "session_start") {
					return on(event, (ev, ctx) => handler(ev?.reason ? ev : { ...ev, reason: "startup" }, ctx));
				}
				return on(EVENT_ALIASES[event] ?? event, handler);
			};
		},
	});
	return egregore(adapted);
}
