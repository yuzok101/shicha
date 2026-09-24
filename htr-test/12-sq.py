import pickle,numpy as np,sys
from onnxruntime.quantization import quantize_static,QuantType,QuantFormat,CalibrationDataReader
from onnxruntime.quantization.shape_inference import quant_pre_process
quant_pre_process('/tmp/web/model-fp32.onnx','/tmp/mk/pre.onnx',skip_symbolic_shape=True)
arrs=pickle.load(open('/tmp/mk/calib.pkl','rb'))
class R(CalibrationDataReader):
    def __init__(s): s.it=iter(arrs)
    def get_next(s):
        a=next(s.it,None); return None if a is None else {'image':a}
ops=sys.argv[1].split(',')
quantize_static('/tmp/mk/pre.onnx',sys.argv[2],R(),quant_format=QuantFormat.QDQ,per_channel=True,activation_type=QuantType.QUInt8,weight_type=QuantType.QInt8,op_types_to_quantize=ops)
print('ok')
