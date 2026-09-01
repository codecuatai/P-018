import sys
from pathlib import Path

_SERVICE_ROOT = str(Path(__file__).resolve().parents[1])
if _SERVICE_ROOT in sys.path:
    sys.path.remove(_SERVICE_ROOT)
sys.path.insert(0, _SERVICE_ROOT)
for _module_name in tuple(sys.modules):
    if _module_name == "src" or _module_name.startswith("src."):
        del sys.modules[_module_name]
