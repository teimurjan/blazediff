import { useEffect, useRef, useState } from "react";

export function useInView(
	threshold = 0.3,
): [React.RefObject<HTMLDivElement | null>, boolean] {
	const ref = useRef<HTMLDivElement | null>(null);
	const [isInView, setIsInView] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		// Delay observer setup so initial-render intersections are skipped —
		// only scroll-triggered intersections fire the callback.
		let observer: IntersectionObserver | null = null;
		const timer = setTimeout(() => {
			observer = new IntersectionObserver(
				([entry]) => {
					if (entry.isIntersecting) {
						setIsInView(true);
						observer?.disconnect();
					}
				},
				{ threshold },
			);
			observer.observe(el);
		}, 150);

		return () => {
			clearTimeout(timer);
			observer?.disconnect();
		};
	}, [threshold]);

	return [ref, isInView];
}
