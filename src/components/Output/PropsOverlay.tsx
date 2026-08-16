import { useEffect, useMemo, useState } from "react";
import type { Prop } from "../../lib/types";

function DigitalClock({ color }: { color: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="prop-clock" style={{ color }}>
      {now.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}
    </div>
  );
}

function AnalogClock({ color }: { color: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const sec = now.getSeconds() * 6;
  const min = now.getMinutes() * 6 + now.getSeconds() * 0.1;
  const hr = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;
  return (
    <div className="prop-analog" style={{ borderColor: color }}>
      <span className="ah" style={{ transform: `rotate(${hr}deg)`, background: color }} />
      <span className="am" style={{ transform: `rotate(${min}deg)`, background: color }} />
      <span className="as" style={{ transform: `rotate(${sec}deg)`, background: color }} />
    </div>
  );
}

function Snow() {
  const flakes = useMemo(
    () =>
      Array.from({ length: 46 }, () => ({
        left: Math.random() * 100,
        dur: 5 + Math.random() * 5,
        delay: Math.random() * 7,
        size: 4 + Math.random() * 6,
        opacity: 0.5 + Math.random() * 0.5,
      })),
    [],
  );
  return (
    <div className="prop-snow">
      {flakes.map((f, i) => (
        <i
          key={i}
          style={{
            left: `${f.left}%`,
            width: f.size,
            height: f.size,
            animationDuration: `${f.dur}s`,
            animationDelay: `${f.delay}s`,
            opacity: f.opacity,
          }}
        />
      ))}
    </div>
  );
}

function Sparkle() {
  const dots = useMemo(
    () =>
      Array.from({ length: 34 }, () => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        delay: Math.random() * 2.4,
        dur: 1.4 + Math.random() * 1.6,
        size: 3 + Math.random() * 5,
      })),
    [],
  );
  return (
    <div className="prop-sparkle">
      {dots.map((d, i) => (
        <i
          key={i}
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function PropsOverlay({ props }: { props: Prop[] | undefined }) {
  if (!props || props.length === 0) return null;
  return (
    <div className="props-overlay">
      {props.map((p) => {
        const style: React.CSSProperties = {
          left: `${p.x}%`,
          top: `${p.y}%`,
          width: `${p.w}%`,
          height: `${p.h}%`,
        };
        const color = p.color || "#ffffff";
        if (p.prop_type === "digital_clock")
          return (
            <div key={p.id} className="prop-box" style={style}>
              <DigitalClock color={color} />
            </div>
          );
        if (p.prop_type === "analog_clock")
          return (
            <div key={p.id} className="prop-box" style={style}>
              <AnalogClock color={color} />
            </div>
          );
        if (p.prop_type === "border")
          return <div key={p.id} className="prop-border" style={{ ...style, ["--bc" as string]: color }} />;
        if (p.prop_type === "snow")
          return (
            <div key={p.id} className="prop-box" style={style}>
              <Snow />
            </div>
          );
        if (p.prop_type === "sparkle")
          return (
            <div key={p.id} className="prop-box" style={style}>
              <Sparkle />
            </div>
          );
        return null;
      })}
    </div>
  );
}
