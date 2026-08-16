import { useEffect, useRef } from "react";
import Icon from "./Icon/Icon";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export default function SearchBox({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onSearch = (e: Event) => {
      e.preventDefault();
      ref.current?.focus();
      ref.current?.select();
    };
    window.addEventListener("pwc:search", onSearch);
    return () => window.removeEventListener("pwc:search", onSearch);
  }, []);

  return (
    <div className="list-search-wrap">
      <Icon name="search" size={13} />
      <input
        ref={ref}
        className="list-search"
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}