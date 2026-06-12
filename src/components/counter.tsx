import { MotionValue, motion, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

interface NumberProps {
  mv: MotionValue<number>;
  number: number;
  height: number;
}

function Number({ mv, number, height }: NumberProps) {
  const y = useTransform(mv, (latest) => {
    const placeValue = latest % 10;
    const offset = (10 + number - placeValue) % 10;
    let memo = offset * height;
    if (offset > 5) {
      memo -= 10 * height;
    }
    return memo;
  });

  const style: React.CSSProperties = {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return <motion.span style={{ ...style, y }}>{number}</motion.span>;
}

interface DigitProps {
  place: number;
  value: number;
  height: number;
  digitStyle?: React.CSSProperties;
  speed?: number;
}

function Digit({ place, value, height, digitStyle, speed = 0.8 }: DigitProps) {
  let valueRoundedToPlace;

  if (place < 1) {
    // For decimal places, handle fractional calculation
    const multiplied = value * (1 / place);
    valueRoundedToPlace = Math.floor(multiplied);
  } else {
    // For integer places, use existing logic
    valueRoundedToPlace = Math.floor(value / place);
  }

  const animatedValue = useSpring(valueRoundedToPlace, {
    stiffness: 100 * speed,
    damping: 30,
  });

  useEffect(() => {
    animatedValue.set(valueRoundedToPlace);
  }, [animatedValue, valueRoundedToPlace]);

  const defaultStyle: React.CSSProperties = {
    height,
    position: "relative",
    width: "1ch",
    fontVariantNumeric: "tabular-nums",
  };

  return (
    <div style={{ ...defaultStyle, ...digitStyle }}>
      {Array.from({ length: 10 }, (_, i) => (
        <Number key={i} mv={animatedValue} number={i} height={height} />
      ))}
    </div>
  );
}

interface CounterProps {
  value: number;
  fontSize?: number;
  padding?: number;
  places?: number[];
  gap?: number;
  borderRadius?: number;
  horizontalPadding?: number;
  textColor?: string;
  fontWeight?: React.CSSProperties["fontWeight"];
  containerStyle?: React.CSSProperties;
  counterStyle?: React.CSSProperties;
  digitStyle?: React.CSSProperties;
  decimalPlaces?: number;
  speed?: number;
}

export default function Counter({
  value,
  fontSize = 100,
  padding = 0,
  places = [100, 10, 1],
  gap = 8,
  borderRadius = 4,
  horizontalPadding = 2,
  textColor = "white",
  fontWeight = "bold",
  containerStyle,
  counterStyle,
  digitStyle,
  decimalPlaces = 0,
  speed = 0.8,
}: CounterProps) {
  const height = fontSize + padding;

  // Use provided places and add decimal places if specified
  const finalPlaces = [...places];
  
  // Add decimal places to the provided places
  for (let i = 1; i <= decimalPlaces; i++) {
    finalPlaces.push(Math.pow(10, -i));
  }

  const defaultContainerStyle: React.CSSProperties = {
    position: "relative",
    display: "inline-block",
  };

  const defaultCounterStyle: React.CSSProperties = {
    fontSize,
    display: "flex",
    gap: gap,
    overflow: "hidden",
    borderRadius: borderRadius,
    paddingLeft: horizontalPadding,
    paddingRight: horizontalPadding,
    lineHeight: 1,
    color: textColor,
    fontWeight: fontWeight,
    alignItems: "center",
    userSelect: "none",
    WebkitUserSelect: "none",
  };

  const separatorStyle: React.CSSProperties = {
    fontSize,
    color: textColor,
    fontWeight: fontWeight,
    lineHeight: 1,
  };

  return (
    <div style={{ ...defaultContainerStyle, ...containerStyle }}>
      <div style={{ ...defaultCounterStyle, ...counterStyle }}>
        {finalPlaces.map((place, index) => {
          const isDecimal = place < 1;
          const integerPlaces = finalPlaces.filter(p => p >= 1);
          
          // Show comma for integer part (every 3 digits from right)
          const shouldShowComma = !isDecimal && index > 0 && (integerPlaces.length - index) % 3 === 0;
          
          // Show decimal point before first decimal place
          const shouldShowDecimal = isDecimal && index === integerPlaces.length;

          return (
            <div key={place} style={{ display: "flex", alignItems: "center" }}>
              {shouldShowComma && <span style={separatorStyle}>,</span>}
              {shouldShowDecimal && <span style={separatorStyle}>.</span>}
              <Digit
                place={place}
                value={value}
                height={height}
                digitStyle={digitStyle}
                speed={speed}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

