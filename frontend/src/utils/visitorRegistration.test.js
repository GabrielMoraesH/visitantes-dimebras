import { describe, expect, it } from "vitest";
import {
  buildVisitorFilesFormData,
  buildVisitorRegistrationPayload,
  getFirstVisitorRegistrationError,
  isValidCPF,
  isValidPhone,
  makeJpgFile,
  uploadVisitorRegistrationErrorMessage,
} from "./visitorRegistration";

describe("visitor registration utils", () => {
  it("valida CPF e telefone", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("123")).toBe(false);

    expect(isValidPhone("(45) 99999-9999")).toBe(true);
    expect(isValidPhone("(45) 3333-4444")).toBe(true);
    expect(isValidPhone("12345")).toBe(false);
  });

  it("retorna a primeira mensagem de erro mantendo a ordem do formulario", () => {
    expect(
      getFirstVisitorRegistrationError({
        companyOk: false,
        cpfOk: true,
        docBackOk: false,
        docFrontOk: false,
        nameOk: true,
        phoneOk: false,
        photoOk: false,
      })
    ).toBe("Telefone inválido (mínimo 10 dígitos).");

    expect(
      getFirstVisitorRegistrationError({
        companyOk: true,
        cpfOk: true,
        docBackOk: true,
        docFrontOk: true,
        nameOk: true,
        phoneOk: true,
        photoOk: true,
      })
    ).toBe("");
  });

  it("monta payload e FormData sem alterar nomes usados pela API", () => {
    const payload = buildVisitorRegistrationPayload({
      company: " Dimebras ",
      cpfDigits: "52998224725",
      name: " Maria Silva ",
      phoneDisplay: "(45) 99999-9999",
    });

    expect(payload).toEqual({
      company: "Dimebras",
      cpf: "52998224725",
      name: "Maria Silva",
      phone: "45999999999",
    });

    const photo = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
    const docFront = new File(["front"], "front.jpg", { type: "image/jpeg" });
    const docBack = new File(["back"], "back.jpg", { type: "image/jpeg" });
    const formData = buildVisitorFilesFormData({ docBack, docFront, photo });

    expect(formData.get("photo")).toBe(photo);
    expect(formData.get("documentFront")).toBe(docFront);
    expect(formData.get("documentBack")).toBe(docBack);
  });

  it("cria arquivo jpg e preserva mensagens de erro de upload", () => {
    const file = makeJpgFile(new Blob(["image"]), "visitante-foto");

    expect(file.name).toBe("visitante-foto.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(uploadVisitorRegistrationErrorMessage({ response: { status: 413 } })).toBe(
      "Imagem excede o limite permitido."
    );
    expect(
      uploadVisitorRegistrationErrorMessage({
        cleanupFailed: true,
        response: { data: { message: "Falha no upload" } },
      })
    ).toBe(
      "Falha no upload. O cadastro pode ter ficado incompleto; busque o CPF novamente para continuar."
    );
  });
});
