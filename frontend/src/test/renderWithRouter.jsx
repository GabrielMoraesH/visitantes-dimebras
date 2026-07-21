import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

export function renderWithRouter({
  element,
  initialEntries = ["/"],
  path = "*",
  extraRoutes = null,
}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path={path} element={element} />
        {extraRoutes}
      </Routes>
    </MemoryRouter>
  );
}
