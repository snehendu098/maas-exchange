"use client";

import { Fragment, type ElementType } from "react";
import { useInView } from "@/lib/hooks";

type Props = {
  text: string; // "\n" = line break
  as?: ElementType;
  className?: string;
  stagger?: number; // ms between words
  delay?: number; // ms before first word
};

/** Masked word-by-word rise when scrolled into view. Remount (key) to replay. */
export default function SplitText({ text, as: Tag = "span", className = "", stagger = 70, delay = 0 }: Props) {
  const [ref, inView] = useInView<HTMLElement>(0.2);
  let i = 0;
  return (
    <Tag ref={ref} className={`split ${inView ? "in" : ""} ${className}`} aria-label={text.replace(/\n/g, " ")}>
      {text.split("\n").map((line, li) => (
        <span key={li} className="split-line" aria-hidden="true">
          {line.split(" ").map((word, wi, words) => {
            const d = delay + i++ * stagger;
            return (
              <Fragment key={wi}>
                <span className="sw">
                  <span className="sw-i" style={{ transitionDelay: `${d}ms` }}>
                    {word}
                  </span>
                </span>
                {wi < words.length - 1 ? " " : null}
              </Fragment>
            );
          })}
        </span>
      ))}
    </Tag>
  );
}
