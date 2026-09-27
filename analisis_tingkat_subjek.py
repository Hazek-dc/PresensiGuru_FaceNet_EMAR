import pandas as pd
import numpy as np
import scipy.stats as stats
import sys
import os

def main():
    np.random.seed(42)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(script_dir, 'exports', 'Dataset_Cochran_Q_ISO30107_6480.csv')
    
    if not os.path.exists(csv_path):
        print(f"Error: Data file not found at {csv_path}")
        sys.exit(1)
        
    df = pd.read_csv(csv_path, encoding='utf-8-sig')
    
    if len(df) != 6480:
        print(f"Error: Expected 6480 rows, found {len(df)}")
        sys.exit(1)
        
    df['correct_decision'] = np.where(df['label_aktual'] == 'Bona_Fide', 'Accept', 'Reject')
    
    # M1 = keputusan_S1, M2 = keputusan_S2, M3 = keputusan_S3
    methods = {'M1': 'keputusan_S1', 'M2': 'keputusan_S2', 'M3': 'keputusan_S3'}
    
    ref_cm = {
        'M1': {'TP': 1606, 'FN': 14, 'TN': 60, 'FP': 4800},
        'M2': {'TP': 1597, 'FN': 23, 'TN': 4818, 'FP': 42},
        'M3': {'TP': 1618, 'FN': 2, 'TN': 4845, 'FP': 15}
    }
    
    cm = {}
    for m, col in methods.items():
        is_bona = df['label_aktual'] == 'Bona_Fide'
        is_attack = df['label_aktual'] != 'Bona_Fide'
        
        is_accept = df[col] == 'Accept'
        is_reject = df[col] == 'Reject'
        
        tp = int((is_bona & is_accept).sum())
        fn = int((is_bona & is_reject).sum())
        tn = int((is_attack & is_reject).sum())
        fp = int((is_attack & is_accept).sum())
        
        cm[m] = {'TP': tp, 'FN': fn, 'TN': tn, 'FP': fp}
        
    # Integrity check
    integrity_failed = False
    for m in methods:
        for metric in ['TP', 'FN', 'TN', 'FP']:
            if cm[m][metric] != ref_cm[m][metric]:
                print(f"Integrity check failed for {m} {metric}: Expected {ref_cm[m][metric]}, got {cm[m][metric]}")
                integrity_failed = True
                
    if integrity_failed:
        print("STOPPING execution due to integrity check failure.")
        sys.exit(1)
        
    print("Integrity check passed.")
    
    # Compute per-subject error rate
    error_rates = []
    subjects = df['participant_id'].unique()
    
    for subject in subjects:
        sub_df = df[df['participant_id'] == subject]
        total_sub = len(sub_df)
        
        err_m1 = (sub_df['keputusan_S1'] != sub_df['correct_decision']).sum() / total_sub * 100
        err_m2 = (sub_df['keputusan_S2'] != sub_df['correct_decision']).sum() / total_sub * 100
        err_m3 = (sub_df['keputusan_S3'] != sub_df['correct_decision']).sum() / total_sub * 100
        
        error_rates.append({
            'participant_id': subject,
            'M1': err_m1,
            'M2': err_m2,
            'M3': err_m3
        })
        
    err_df = pd.DataFrame(error_rates)
    out_csv = os.path.join(script_dir, 'galat_per_subjek.csv')
    err_df.to_csv(out_csv, index=False)
    print(f"Saved {out_csv}")
    
    # Statistical tests
    # Friedman test
    m1_err = err_df['M1'].values
    m2_err = err_df['M2'].values
    m3_err = err_df['M3'].values
    
    stat, p_friedman = stats.friedmanchisquare(m1_err, m2_err, m3_err)
    
    # Wilcoxon with Bonferroni (alpha = 0.05 / 3 = 0.0167)
    stat_12, p_12 = stats.wilcoxon(m1_err, m2_err)
    stat_13, p_13 = stats.wilcoxon(m1_err, m3_err)
    stat_23, p_23 = stats.wilcoxon(m2_err, m3_err)
    
    # Effect sizes (Mean difference and 95% CI)
    def mean_diff_ci(a, b):
        diff = a - b
        mean_diff = np.mean(diff)
        se = stats.sem(diff)
        ci = stats.t.interval(0.95, len(diff)-1, loc=mean_diff, scale=se)
        return mean_diff, ci
        
    diff_12, ci_12 = mean_diff_ci(m1_err, m2_err)
    diff_13, ci_13 = mean_diff_ci(m1_err, m3_err)
    diff_23, ci_23 = mean_diff_ci(m2_err, m3_err)
    
    # Design effects
    m_obs = 360
    rhos = [0.01, 0.05, 0.10]
    deffs = {rho: 1 + (m_obs - 1) * rho for rho in rhos}
    
    # Generate report
    report = []
    report.append("SUBJECT-LEVEL ANALYSIS REPORT")
    report.append("=============================")
    report.append(f"Total rows processed: {len(df)}")
    report.append("Integrity Check: PASSED\n")
    
    report.append("1. Error Rates (Mean ± Std) [%]")
    report.append(f"M1: {np.mean(m1_err):.2f} ± {np.std(m1_err):.2f}")
    report.append(f"M2: {np.mean(m2_err):.2f} ± {np.std(m2_err):.2f}")
    report.append(f"M3: {np.mean(m3_err):.2f} ± {np.std(m3_err):.2f}\n")
    
    report.append("2. Friedman Test")
    report.append(f"Statistic: {stat:.4f}, p-value: {p_friedman:.4e}\n")
    
    report.append("3. Wilcoxon Signed-Rank Test (Bonferroni alpha=0.0167)")
    report.append(f"M1 vs M2: stat={stat_12:.4f}, p={p_12:.4e} (Sig: {p_12 < 0.0167})")
    report.append(f"M1 vs M3: stat={stat_13:.4f}, p={p_13:.4e} (Sig: {p_13 < 0.0167})")
    report.append(f"M2 vs M3: stat={stat_23:.4f}, p={p_23:.4e} (Sig: {p_23 < 0.0167})\n")
    
    report.append("4. Effect Sizes (Mean Difference & 95% CI)")
    report.append(f"M1 - M2: {diff_12:.2f} [{ci_12[0]:.2f}, {ci_12[1]:.2f}]")
    report.append(f"M1 - M3: {diff_13:.2f} [{ci_13[0]:.2f}, {ci_13[1]:.2f}]")
    report.append(f"M2 - M3: {diff_23:.2f} [{ci_23[0]:.2f}, {ci_23[1]:.2f}]\n")
    
    report.append("5. Design Effects")
    for rho, deff in deffs.items():
        report.append(f"rho = {rho}: deff = {deff:.2f}")
        
    report_str = '\n'.join(report)
    print("\n" + report_str)
    
    out_txt = os.path.join(script_dir, 'hasil_statistik.txt')
    with open(out_txt, 'w', encoding='utf-8') as f:
        f.write(report_str)
        
    print(f"\nSaved {out_txt}")

if __name__ == '__main__':
    main()
