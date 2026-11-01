package com.qingji.ledger;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.Base64;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.common.MlKit;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/** Bundled Chinese model. The application manifest deliberately has no Internet permission. */
final class OfflineTextRecognizer {
    private static boolean initialized;

    private static synchronized void initialize(Context context) {
        if (!initialized) { MlKit.initialize(context.getApplicationContext()); initialized = true; }
    }

    static JSONObject recognize(Context context, String base64) throws Exception {
        byte[] bytes = Base64.decode(base64, Base64.NO_WRAP);
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0 ||
                (long) bounds.outWidth * bounds.outHeight > 3200000L) {
            throw new IllegalArgumentException("图片分块尺寸无效，请重新选择截图");
        }
        Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (bitmap == null) throw new IllegalArgumentException("无法读取图片");
        TextRecognizer recognizer = null;
        try {
            initialize(context);
            recognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
            Text result = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)), 45, TimeUnit.SECONDS);
            JSONArray blocks = new JSONArray();
            for (Text.TextBlock block : result.getTextBlocks()) {
                JSONArray lines = new JSONArray();
                for (Text.Line line : block.getLines()) {
                    Rect box = line.getBoundingBox();
                    if (box == null) continue;
                    lines.put(new JSONObject().put("text", line.getText()).put("bbox", new JSONObject()
                        .put("x0", box.left).put("y0", box.top).put("x1", box.right).put("y1", box.bottom)));
                }
                blocks.put(new JSONObject().put("paragraphs", new JSONArray().put(new JSONObject().put("lines", lines))));
            }
            return new JSONObject().put("text", result.getText()).put("blocks", blocks).put("engine", "mlkit-chinese-bundled");
        } finally {
            if (recognizer != null) recognizer.close();
            bitmap.recycle();
        }
    }
}
