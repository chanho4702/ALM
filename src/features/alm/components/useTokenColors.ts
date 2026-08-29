import { useEffect, useState } from "react";

/**
 * 디자인 토큰을 실제 색 값으로 푼다 — SVG **속성**(stroke="…")은 `var()`를 해석하지 못해서
 * Recharts처럼 속성으로 색을 쓰는 라이브러리에는 계산된 값을 넘겨야 한다.
 * 테마(`data-theme`)가 바뀌면 다시 읽는다. 토큰 이름은 `--chanho-` 접두사를 뺀 형태로 받는다.
 */
export function useTokenColors<const K extends readonly string[]>(
  names: K,
): Record<K[number], string> {
  const read = () => {
    const style = getComputedStyle(document.documentElement);
    const out = {} as Record<K[number], string>;
    for (const name of names) {
      out[name as K[number]] = style.getPropertyValue(`--chanho-${name}`).trim();
    }
    return out;
  };

  const [colors, setColors] = useState(read);

  useEffect(() => {
    setColors(read());
    // 첫 렌더 시점에 토큰 스타일시트가 아직 안 붙어 있으면 빈 값을 읽는다(dev의 비동기 CSS 주입).
    // 다음 프레임과 load 이후에 한 번 더 읽어 첫 그림이 투명하게 남지 않게 한다.
    const frame = requestAnimationFrame(() => setColors(read()));
    const onLoad = () => setColors(read());
    window.addEventListener("load", onLoad);
    const observer = new MutationObserver(() => setColors(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("load", onLoad);
      observer.disconnect();
    };
    // names는 호출부가 리터럴로 고정한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return colors;
}
