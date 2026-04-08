import { COLORS, FONT_MONO } from "../styles";
import type { ChangeRegion } from "../types";

const CHANGE_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
	addition: COLORS.addition,
	deletion: COLORS.deletion,
	"content-change": COLORS.contentChange,
};

interface RegionCardProps {
	region: ChangeRegion;
	contentOpacity: number;
}

export const RegionCard: React.FC<RegionCardProps> = ({
	region,
	contentOpacity,
}) => {
	const colors =
		CHANGE_TYPE_COLORS[region.changeType] ??
		CHANGE_TYPE_COLORS["content-change"];

	return (
		<div
			style={{
				padding: "16px 24px",
				borderRadius: 12,
				border: `1px solid ${COLORS.cardBorder}`,
				backgroundColor: COLORS.cardBg,
				width: "100%",
			}}
		>
			<div
				style={{
					opacity: contentOpacity,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-around",
				}}
			>
				<span
					style={{
						display: "inline-block",
						padding: "8px 20px",
						borderRadius: 8,
						fontSize: 42,
						fontWeight: 600,
						fontFamily: FONT_MONO,
						backgroundColor: colors.bg,
						color: colors.text,
						flexShrink: 0,
					}}
				>
					{region.changeType}
				</span>

				<span
					style={{
						fontSize: 42,
						fontFamily: FONT_MONO,
						color: COLORS.text,
						whiteSpace: "nowrap",
					}}
				>
					position: {region.position}
				</span>
			</div>
		</div>
	);
};
