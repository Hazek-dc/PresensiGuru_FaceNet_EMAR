<?php

namespace App\Http\Controllers;

use App\Services\DistanceModel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Pra-cek posisi sebelum pemindaian 8 s. Hanya menentukan apakah pemindaian
 * boleh dimulai; server tidak pernah menolak presentasi karena jarak.
 */
class DistanceCheckController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate([
            'distance_cm' => 'nullable|numeric|min:0|max:1000',
            'face_detected' => 'required',
        ]);

        // FormData mengirim "true"/"false", JSON mengirim boolean.
        $faceDetected = filter_var($request->input('face_detected'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($faceDetected === null) {
            throw ValidationException::withMessages([
                'face_detected' => 'face_detected harus bernilai true atau false.',
            ]);
        }

        $distance = $request->filled('distance_cm') ? (float) $request->input('distance_cm') : null;

        return response()->json(DistanceModel::classify($distance, $faceDetected));
    }
}
