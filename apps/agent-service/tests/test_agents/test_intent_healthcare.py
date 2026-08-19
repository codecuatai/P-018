
from src.agents.intent import classify

def test_classify_healthcare_with_diacritics():
    # Because intent.py uses plain(), diacritics are removed before matching
    # The keywords inside intent.py have been updated to be without diacritics.
    assert classify('tôi bị đau bụng') == 'healthcare'
    assert classify('đau dạ dày quá') == 'healthcare'
    assert classify('bị đau đầu') == 'healthcare'
    assert classify('tôi bị cảm lạnh') == 'healthcare'
    assert classify('đau lưng quá') == 'healthcare'

def test_classify_food_pure():
    assert classify('tôi muốn ăn gà rán') == 'search_food'
    assert classify('pizza ngon') == 'search_food'
