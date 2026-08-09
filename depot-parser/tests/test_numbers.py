import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.numbers import parse_de_number, parse_signed_amount


def test_parse_de_number():
    assert parse_de_number("1.250,43") == 1250.43
    assert parse_de_number("10,712") == 10.712
    assert parse_de_number("3.000") == 3000.0
    assert parse_de_number("0,443") == 0.443


def test_parse_signed_amount_trailing_minus():
    assert parse_signed_amount("15,30-") == -15.30
    assert parse_signed_amount("15,30") == 15.30
    assert parse_signed_amount("-15,30") == -15.30


if __name__ == "__main__":
    test_parse_de_number()
    test_parse_signed_amount_trailing_minus()
    print("OK")
