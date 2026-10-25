import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RatingStars } from "./RatingStars";

describe("RatingStars", () => {
  it.each([0.5, 1, 7.5, 9.5, 10])("selects %s exactly", async (rating) => {
    const onRate = vi.fn();
    render(<RatingStars currentRating={0} onRate={onRate} ariaPrefix="Film" />);
    await userEvent.click(screen.getByRole("button", { name: `Film: ${rating} von 10 Sternen` }));
    expect(onRate).toHaveBeenCalledExactlyOnceWith(rating);
  });
  it("reflects the saved rating and supports Enter and Space", async () => {
    function Rating() {
      const [rating, setRating] = useState(7.5);
      return <RatingStars currentRating={rating} onRate={setRating} ariaPrefix="Film" />;
    }
    render(<Rating />);
    expect(screen.getByRole("button", { name: "Film: 7.5 von 10 Sternen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Film: 0.5 von 10 Sternen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.tab();
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "Film: 1 von 10 Sternen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("clears hover and keyboard previews without changing the saved rating", async () => {
    const onRate = vi.fn();
    const { container } = render(
      <>
        <RatingStars currentRating={7.5} onRate={onRate} ariaPrefix="Film" />
        <button>Weiter</button>
      </>,
    );
    const target = screen.getByRole("button", { name: "Film: 10 von 10 Sternen" });
    fireEvent.mouseEnter(target);
    expect(screen.getByText("10/10")).toBeInTheDocument();
    fireEvent.mouseLeave(container.querySelector("div.flex")!);
    expect(screen.getByText("7.5/10")).toBeInTheDocument();
    fireEvent.focus(target);
    fireEvent.blur(target, { relatedTarget: screen.getByRole("button", { name: "Weiter" }) });
    expect(screen.getByText("7.5/10")).toBeInTheDocument();
    expect(onRate).not.toHaveBeenCalled();
  });
  it("has a read-only state without misleading clickable stars", () => {
    render(<RatingStars currentRating={8} ariaPrefix="Film" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("8/10")).toBeInTheDocument();
  });
  it("keeps season ratings independent", async () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <>
        <RatingStars currentRating={7.5} onRate={first} ariaPrefix="Staffel 1" />
        <RatingStars currentRating={0} onRate={second} ariaPrefix="Staffel 2" />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Staffel 2: 9.5 von 10 Sternen" }));
    expect(second).toHaveBeenCalledExactlyOnceWith(9.5);
    expect(first).not.toHaveBeenCalled();
  });
});
