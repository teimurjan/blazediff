import { Composition } from "remotion";
import { Video } from "./Video";

export const Root: React.FC = () => {
	return (
		// biome-ignore lint/correctness/useUniqueElementIds: Remotion requires static composition id
		<Composition
			id="BlazeDiffDemo"
			component={Video}
			durationInFrames={756}
			fps={30}
			width={1920}
			height={1080}
		/>
	);
};
