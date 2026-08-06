import { describe, expect, it } from "vitest";
import {
  buildVisitorFilesFormData,
  buildVisitorRegistrationPayload,
  buildVisitorWithFilesFormData,
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
        company: "",
        companyOk: false,
        cpfDigits: "52998224725",
        cpfOk: true,
        docBackOk: false,
        docFrontOk: false,
        name: "Maria Silva",
        nameOk: true,
        phoneDisplay: "12345",
        phoneOk: false,
        photoOk: false,
      })
    ).toBe("Digite um telefone com DDD.");

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

  it.each([
    [{ cpfDigits: "", cpfOk: false }, "Informe o CPF."],
    [{ cpfDigits: "11111111111", cpfOk: false }, "Digite um CPF válido."],
    [{ cpfDigits: "52998224725", cpfOk: true, name: "", nameOk: false }, "Informe o nome completo."],
    [{ cpfDigits: "52998224725", cpfOk: true, name: "Ma", nameOk: false }, "Digite o nome completo com pelo menos 3 caracteres."],
    [
      { cpfDigits: "52998224725", cpfOk: true, name: "Maria", nameOk: true, phoneDisplay: "", phoneOk: false },
      "Informe o telefone.",
    ],
    [
      { cpfDigits: "52998224725", cpfOk: true, name: "Maria", nameOk: true, phoneDisplay: "12345", phoneOk: false },
      "Digite um telefone com DDD.",
    ],
    [
      {
        cpfDigits: "52998224725",
        cpfOk: true,
        name: "Maria",
        nameOk: true,
        phoneDisplay: "45999999999",
        phoneOk: true,
        company: "",
        companyOk: false,
      },
      "Informe a empresa.",
    ],
    [
      {
        cpfDigits: "52998224725",
        cpfOk: true,
        name: "Maria",
        nameOk: true,
        phoneDisplay: "45999999999",
        phoneOk: true,
        company: "D",
        companyOk: false,
      },
      "Digite o nome da empresa com pelo menos 2 caracteres.",
    ],
  ])("retorna mensagem orientativa para erro local %#", (validation, expected) => {
    expect(
      getFirstVisitorRegistrationError({
        company: "Dimebras",
        companyOk: true,
        docBackOk: true,
        docFrontOk: true,
        name: "Maria Silva",
        nameOk: true,
        phoneDisplay: "45999999999",
        phoneOk: true,
        photoOk: true,
        ...validation,
      })
    ).toBe(expected);
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

  it("monta FormData transacional com os campos exatos e normalizados", () => {
    const photo = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
    const docFront = new File(["front"], "front.jpg", { type: "image/jpeg" });
    const docBack = new File(["back"], "back.jpg", { type: "image/jpeg" });

    const formData = buildVisitorWithFilesFormData({
      company: " Dimebras ",
      cpfDigits: "52998224725",
      docBack,
      docFront,
      name: " Maria Silva ",
      phoneDisplay: "(45) 99999-9999",
      photo,
    });

    expect(Array.from(formData.keys())).toEqual([
      "name",
      "cpf",
      "phone",
      "company",
      "photo",
      "documentFront",
      "documentBack",
    ]);
    expect(formData.get("name")).toBe("Maria Silva");
    expect(formData.get("cpf")).toBe("52998224725");
    expect(formData.get("phone")).toBe("45999999999");
    expect(formData.get("company")).toBe("Dimebras");
    expect(formData.get("photo")).toBe(photo);
    expect(formData.get("documentFront")).toBe(docFront);
    expect(formData.get("documentBack")).toBe(docBack);
  });

  it("cria arquivo jpg e preserva mensagens de erro de upload", () => {
    const file = makeJpgFile(new Blob(["image"]), "visitante-foto");

    expect(file.name).toBe("visitante-foto.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(uploadVisitorRegistrationErrorMessage({ response: { status: 413 } })).toBe(
      "A imagem excede o tamanho permitido. Capture outra imagem."
    );
    expect(
      uploadVisitorRegistrationErrorMessage({
        response: { data: { message: "Falha no upload" } },
      })
    ).toBe("Não foi possível concluir o cadastro. Tente novamente em alguns instantes.");
    expect(uploadVisitorRegistrationErrorMessage({ response: { status: 415 } })).toBe(
      "Formato de imagem não permitido. Capture a imagem novamente."
    );
    expect(uploadVisitorRegistrationErrorMessage({ request: {} })).toBe(
      "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."
    );
  });
});
