"""Parser de preço robusto. Substitui o arrumar_preco do Colab (que tinha bug:
"R$ 1.234,56" virava a string inválida " 1,234,56"). Retorna float ou None.

Heurística: se aparecem os dois separadores ('.' e ','), o último é o decimal e
o outro é milhar. Se só um tipo aparece, olha quantos dígitos vêm depois da
última ocorrência: 1-2 dígitos = separador decimal; 3 dígitos = milhar (sem
centavos), ex: "R$ 1.234" (mil duzentos e trinta e quatro reais).

Casos tratados:
  "R$ 1.234,56" -> 1234.56   "1,234.56" -> 1234.56   "26,99" -> 26.99
  "26.99"       -> 26.99     "1234"     -> 1234.0    "R$ 1.234" -> 1234.0
"""
import re


def parse_price(raw) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)

    s = re.sub(r"[^0-9.,]", "", str(raw))  # mantém só dígitos, ponto e vírgula
    if not s:
        return None

    has_dot = "." in s
    has_comma = "," in s

    if has_dot and has_comma:
        dec_sep = "," if s.rfind(",") > s.rfind(".") else "."
    elif has_dot or has_comma:
        sep = "." if has_dot else ","
        digits_after_last = len(s) - s.rfind(sep) - 1
        dec_sep = sep if digits_after_last <= 2 else None
    else:
        dec_sep = None

    if dec_sep is None:
        # sem separador decimal identificável: tudo é parte inteira
        digits = re.sub(r"[.,]", "", s)
        return float(digits) if digits else None

    dec_pos = s.rfind(dec_sep)
    int_part = re.sub(r"[.,]", "", s[:dec_pos]) or "0"
    frac_part = re.sub(r"[.,]", "", s[dec_pos + 1 :])
    return float(f"{int_part}.{frac_part}") if frac_part else float(int_part)
